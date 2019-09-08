const { Visit, Check, User, Community, Company } = require("../models");
const { send } = require("../oneSignal");
const ApiError = require("../utils/ApiError");
const mongoose = require("mongoose");
const moment = require("moment-timezone");
const Webhook = require("./webhook");
const uuidv5 = require('uuid/v5');
const {
  findIfUserIsOnCommunity,
  findIfUserIsCommunitySecure,
  findIfUserIsGranted
} = require("./utils");

const UUID_NAMESPACE = "f5f8cbe3-1431-4a9d-8d3a-9424fc493b1e";
const TOKEN_LENGTH = 6;

async function create({
  resident,
  identification,
  name,
  community,
  kind,
  intervals,
  companions,
  partOfDay,
  dayOfVisit,
  timezone
}) {
  try {
    await findIfUserIsOnCommunity(community, resident);
    const guest = await findOrCreateGuest(identification, name, kind);
    const token = createToken(community);
    let visit = new Visit({
      resident,
      guest: guest._id,
      community,
      kind,
      guestType: kind == "SPORADIC" ? "Company" : "User",
      timezone,
      token
    });

    if (kind == "SCHEDULED") {
      visit.dayOfVisit = new Date(dayOfVisit);
      visit.companions = companions;
      visit.partOfDay = partOfDay;
    }

    if (kind == "FREQUENT") {
      visit.intervals = intervals;
      visit.limit = moment().add("1", "year");
    }

    await visit.save();
    await populateVisit(visit);
    await Webhook.run(community, "ON_NEW_VISIT", visit);
    return visit;
  } catch (e) {
    console.error("{VISIT} Error Creating:", e);
    throw new ApiError("Error en los datos ingresados", 400);
  }
}

function createToken(community) {
  const ids = uuidv5(community, UUID_NAMESPACE).replace(/[\[\]-]+/g, '');
  let result = '';
  for (let index = 0; index < TOKEN_LENGTH; index++) {
    const i = Math.floor(Math.random() * (ids.length - 1));
    result += ids[i];
  }
  return `${community}-${result}`;
}

async function populateVisit(visit) {
  if (visit.kind == "SPORADIC")
    await Company.populate(visit, { path: "guest" });
  else await User.populate(visit, { path: "guest" });

  await User.populate(visit, { path: "resident" });
  await Community.populate(visit, { path: "community" });
}

async function findOrCreateGuest(identification, name, kind) {
  if (kind == "SPORADIC")
    return await Company.findOneOrCreate({ name }, { name });
  else
    return await User.findOneOrCreate(
      { identification },
      { identification, name }
    );
}

async function update(visitId, info, user) {
  const visit = await Visit.findOne({ _id: visitId, resident: user.id });
  if (!visit) throw new ApiError("Visita no encontrada", 404);
  visit.set(info);
  await visit.save();
  return visit;
}

async function check(visit, type) {
  const check = new Check({ visit, type });
  if (type == "IN") await runAccessWebhooks(visit);
  await check.save();
  return check;
}

async function addPhotos(identification, photo) {
  const photos = await uploadFiles(photo);
  if(photos.length ===0){
    return;
  }
  const guest = await findGuest(identification);
  let visit = await Visit.find({
    guest: guest.id,
  }).sort({
    created_at: -1
  });
  let visit2 = visit[0];
  visit2.images = photos
  visit2.save();
}



async function uploadFiles(files) {
  const paths = [];
  for (const key in files) {
    const path = await uploadFile("storage", files[key]);
    paths.push(path);
  }
  return paths;
}

async function uploadFile(dir, file) {
  const URL = process.env.URL || "http://localhost:3000";
  return new Promise((resolve, reject) => {
    file.mv(`${dir}/${file.name}`, err => {
      if (err) reject(err);
      resolve(`${URL}/${dir}/${file.name}`);
    });
  });
}

async function runAccessWebhooks(visitId) {
  const visit = await Visit.findOne({ _id: visitId });
  await Webhook.run(visit.community, "ON_ACCESS", visit);
}

async function guestIsScheduled(
  community,
  identification,
  email,
  name,
  userWhoAsk,
  token
) {
  await findIfUserIsCommunitySecure(community, userWhoAsk);
  let visit;
  if (token) {
    visit = await Visit.find({
      token: `${community}-${token}`
    }).sort({
      created_at: -1
    });
  } else {
    const guest = await findGuest(identification, email, name);
    if (guest == null){ 
      throw new ApiError("Visitante no Existente", 404);
    }
    visit = await Visit.find({
      guest: guest._id,
      community: community
    }).sort({
      created_at: -1
    });
  }

  const visits = await Promise.all(visit.map(item => evaluateVisit(item)));

  const visitsFiltered = visits.filter(item => item != null);
  
  if(visitsFiltered[0]){
    return await fillVisit(visit[0]);
  }
  else if (visitsFiltered.length === 0)
    throw new ApiError("Visita no encontrada 2", 404);
  return await fillVisit(visitsFiltered[0]);
}

async function fillVisit(visit) {
  return await Visit.findOne({ _id: visit.id })
    .populate("guest")
    .populate("resident")
    .populate("community");
}

async function findGuest(identification = "", email = "", name = "") {
  const user = await User.findOne().or([{identification}, {email}, {name}]);
  if(user)
    return user;
  else{
    const company = await Company.findOne({ name });
    return company;
  }
}

async function evaluateVisit(visit) {
  const check = await Check.findOne({ visit: visit.id });
  switch (visit.kind) {
    case "SCHEDULED":
      return evaluateScheduled(visit) && check == null ? visit : null;
    case "FREQUENT":
      return evaluateFrequent(visit) ? visit : null;
    case "SPORADIC":
      return check == null;
    default:
  }
}

function evaluateScheduled(visit) {
  const now = moment().tz(visit.timezone);
  const visitDay = moment(visit.dayOfVisit);
  return visitDay.format("DD/MM/YYYY") === now.format("DD/MM/YYYY");
}

function evaluateFrequent(visit) {
  const { intervals } = visit;
  const now = moment().tz(visit.timezone);
  const day = now.day();
  const hour = now.hour() * 100 + now.minutes();
  return (
    intervals.filter(
      item => item.day == day && item.from <= hour && item.to >= hour
    ).length > 0
  );
}

async function findByResident(resident, timezone, kind, skip, limit) {
  let visits;
  if (kind == "FREQUENT") {
    visits = await Visit.find({ resident, kind })
      .select(Visit.residentSelector)
      .populate({
        path: "guest",
        model: kind == "SPORADIC" ? "Company" : "User"
      })
      .populate("community")
      .sort({ created_at: -1 })
      .limit(limit)
      .skip(skip);
  } else if (kind == "SCHEDULED") {
    visits = await Visit.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "guest",
          foreignField: "_id",
          as: "guest"
        }
      },
      {
        $lookup: {
          from: "communities",
          localField: "community",
          foreignField: "_id",
          as: "community"
        }
      },
      {
        $lookup: {
          from: "checks",
          localField: "_id",
          foreignField: "visit",
          as: "checks"
        }
      },
      {
        $match: {
          checks: { $size: 0 },
          resident: mongoose.Types.ObjectId(resident),
          kind,
          dayOfVisit: {
            $gte: new Date(
              moment()
                .tz(timezone ? timezone : "America/Bogota")
                .format("YYYY-MM-DD")
            )
          }
        }
      },
      {
        $unwind: "$community"
      },
      {
        $unwind: "$guest"
      },
      {
        $project: {
          resident: 0
        }
      },
      { $sort: { created_at: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);
  } else {
    visits = await Visit.aggregate([
      {
        $match: {
          resident: mongoose.Types.ObjectId(resident),
          kind
        }
      },
      {
        $lookup: {
          from: "companies",
          localField: "guest",
          foreignField: "_id",
          as: "guest"
        }
      },
      {
        $lookup: {
          from: "communities",
          localField: "community",
          foreignField: "_id",
          as: "community"
        }
      },
      {
        $lookup: {
          from: "checks",
          localField: "_id",
          foreignField: "visit",
          as: "checks"
        }
      },
      {
        $match: {
          checks: { $size: 0 }
        }
      },
      {
        $unwind: "$community"
      },
      {
        $unwind: "$guest"
      },
      {
        $project: {
          resident: 0
        }
      },
      { $sort: { created_at: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);
  }
  return { visits };
}

async function destroy(visit, user) {
  const visitInstance = await Visit.findOne({ _id: visit, resident: user });
  if (!visitInstance)
    throw new ApiError("No posee autorizacion para realizar esta accion", 401);
  return await visitInstance.remove();
}

async function giveAccess(visitId, access, user) {
  const visit = await Visit.findOne({ _id: visitId, resident: user.id })
    .populate("guest")
    .populate("creator")
    .populate("resident")
    .populate("community");

  if (!visit)
    throw new ApiError("No posee autorizacion para realizar esta accion", 401);

  const push = await send(visit.creator.devices, "VISIT ACCESS", {
    visit: {
      resident: visit.resident,
      guest: visit.guest,
      kind: visit.kind
    },
    access
  });
  if (access) await check(visit.id, "IN");
  return { success: true };
}

async function communityVisits(community, user) {
  await findIfUserIsGranted(community, user);
  const visits = await Visit.aggregate([
    {
      $lookup: {
        from: "checks",
        localField: "_id",
        foreignField: "visit",
        as: "checks"
      }
    },
    {
      $lookup: {
        from: "communityusers",
        localField: "community",
        foreignField: "community",
        as: "community_user"
      }
    },
    {
      $match: {
        "checks.type": "IN",
        community: mongoose.Types.ObjectId(community)
      }
    }
  ]);
  await User.populate(visits, { path: "resident" });
  const promises = visits.map(visit => {
    const populator = visit.guestType === "User" ? User : Company;
    return populator.populate(visit, { path: "guest" });
  });
  await Promise.all(promises);
  return visits;
}

async function findByGuest(user, skip, limit) {
  const visits = await Visit.find({
    guest: user.id,
    $or: [
      { limit: { $gte: moment().tz(user.timezone) }, kind: "FREQUENT" },
      { dayOfVisit: { $gte: moment().tz(user.timezone) }, kind: "SCHEDULED" }
    ],
  })
    .skip(skip)
    .limit(limit)
    .populate("resident")
    .populate("guest")
    .populate("community");

  return { visits };
}

async function detail(visit) {
  return await Visit.findOne({ _id: visit })
    .populate("guest")
    .populate("creator")
    .populate("resident")
    .populate("community");
}

module.exports = {
  create,
  update,
  check,
  destroy,
  guestIsScheduled,
  findByResident,
  communityVisits,
  giveAccess,
  detail,
  findByGuest,
  addPhotos, 
  uploadFiles
};
