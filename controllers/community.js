const { Community, CommunityUser, User, Visit, Rule, CommunityRule } = require("../models");
const VisitCtrllr = require("./visit");
const ApiError = require("../utils/ApiError");
const mongoose = require("mongoose");
const { send } = require("../oneSignal");
const { findIfUserIsGranted, findIfUserIsCommunitySecure } = require("./utils");

// TODO SECURE THIS ROUTE!
async function create(info, image, user) {
  try {
    let rules = [];
    let rule = null;
    if(info.rules != "undefined"){
      info.rules = JSON.parse(info.rules);
      for (const rul in info.rules) {
        rule = await Rule.findOneOrCreate({'name' : info.rules[rul]}, {'name': info.rules[rul]});
        await rule.save();
        rules.push(rule);
      }
    }
    if (typeof info.address === "string")
      info.address = JSON.parse(info.address);
    const community = new Community(info);
    if (image) {
      const imageUrl = await uploadFile("storage", image);
      community.image = imageUrl;
    }
    await community.save();
    const communityUser = new CommunityUser({
      community: community.id,
      user: user.id,
      kind: "ADMINISTRATOR",
      status: "APPROVED"
    });
    await communityUser.save();
    rules.forEach(async rule => {
      const communityRule = new CommunityRule({
        community,
        rule
      })
      await communityRule.save();
    });
    return community;
  } catch (e) {
    throw new ApiError("Error en los datos ingresados", 400);
  }
}

async function update(id, communityInfo, user) {
  await findIfUserIsGranted(id, user);
  let community = await Community.findOne({ _id: id });
  community.set(communityInfo);
  await community.save();
  return community;
}

async function all(query, skip, limit) {
  return await Community.find({
    $or: [
      { name: { $regex: query, $options: "i" } },
      { "address.fullAddress": { $regex: query, $options: "i" } },
    ]
  }).skip(skip).limit(limit);
}

async function destroy(id, user) {
  await findIfUserIsGranted(id, user);
  let community = await Community.findOne({ _id: id });
  await community.remove();
  return true;
}

async function details(id, user) {
  let community = await Community.findOne({ _id: id });
  if (!community) throw new ApiError("Community Not Found", 404);
  return community;
}

async function userCommunities(user) {
  const communitiesRaw = await Community.aggregate([
    {
      $lookup: {
        from: "communityusers",
        localField: "_id",
        foreignField: "community",
        as: "community_users"
      }
    },
    {
      $unwind: "$community_users"
    },
    {
      $match: {
        "community_users.user": mongoose.Types.ObjectId(user)
      }
    }
  ]);
  const communities = communitiesRaw.map(item => {
    return {
      ...item,
      kind: item.community_users.kind,
      status: item.community_users.status
    };
  });
  return { communities };
}

async function securityCommunities(user) {
  const communitiesRaw = await Community.aggregate([
    {
      $lookup: {
        from: "communityusers",
        localField: "_id",
        foreignField: "community",
        as: "community_users"
      }
    },
    {
      $unwind: "$community_users"
    },
    {
      $match: {
        "community_users.user": mongoose.Types.ObjectId(user),
        "community_users.kind": "SECURITY",
        "community_users.status": "APPROVED"
      }
    }
  ]);
  const communities = communitiesRaw.map(item => {
    return {
      ...item,
      kind: item.community_users.kind,
      status: item.community_users.status
    };
  });
  return { communities };
}

async function people(communityId, skip, limit) {
  try {
    return await CommunityUser.find({ community: communityId });
  } catch (e) {
    throw new ApiError("Comunidad no Encontrada", 404);
  }
}

async function requestAccess(
  communityId,
  { name, identification, residentIdentification, reference, note },
  files,
  user
) {
  console.log({note, residentIdentification, reference});
  let rule = await verifyRule(communityId, 'resident');
  let resident = null;
  await findIfUserIsCommunitySecure(communityId, user);
  const guest = await User.findOneOrCreate(
    { identification },
    { identification, name }
  );
  if(rule || residentIdentification || reference){
    const communityUser = await findCommunityUserByIdOrReference(
      communityId,
      residentIdentification,
      reference
    );
    if (!communityUser) throw new ApiError("Residente no encontrado", 404);
  
    resident = await User.findOne({
      _id: communityUser.user,
      "devices.0": { $exists: true }
    });
  
    if (!resident) throw new ApiError("Dispositivo del residente no encontrado", 412);
  }else if (note){
    resident = user;
  }else {
    throw new ApiError("Debe adjuntar una nota de hacia donde va el visitante", 404);
  }
  const photos = await uploadFiles(files);
  console.log({note});
  const visit = new Visit({
    community: communityId,
    resident: resident.id,
    guest: guest.id,
    kind: "NOT EXPECTED",
    creator: user.id,
    timezone: resident.timezone,
    images: photos,
    token: "",
    note: note
  });
  console.log({visit});
  await visit.save();

  await send(resident.devices, "UNEXPECTED VISIT", {
    visit: {
      ...visit.toJSON(),
      guest: guest.toJSON(),
      resident: resident.toJSON()
    },
    photos
  });
  return { success: true };
}

async function verifyRule(community, nameRule){
  let rule = await Rule.findOne({'name' : nameRule});
  if(rule){
    let communityRule = await CommunityRule.find({community, rule: rule._id});
    if(communityRule.length >0)
      return false;
    return true;
  }
  return true;

}

async function giveAccessBySecurity(
  communityId,
  { name, identification, residentIdentification, reference, note },
  files,
  user
) {
  console.log(note);
  let validation = await verifyRule(communityId, 'security');
  if(!validation){
    throw new ApiError("Usted no tiene permisos para esto", 412);
  }
  await findIfUserIsCommunitySecure(communityId, user);

  const guest = await User.findOneOrCreate(
    { identification },
    { identification, name, timezone: user.timezone }
  );
  let resident = null;
  if(reference){
    resident = await CommunityUser.findOne({"reference": reference, "community": communityId}); 
  }
  else{
    let user = await User.findOne({"identification": residentIdentification});
    resident = await CommunityUser.findOne({"user": user._id, "community": communityId});
  }
  console.log("RESIDENT:", resident, reference)
  const photos = await uploadFiles(files);
  const visit = new Visit({
    community: communityId,
    resident: resident ? resident.user : user.id,
    guest: guest.id,
    kind: "NOT EXPECTED",
    creator: user.id,
    timezone: user.timezone,
    images: photos,
    token: "",
    note: note
  });

  await visit.save();
  await VisitCtrllr.check(visit.id, "IN");
  return { success: true };
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

async function findCommunityUserByIdOrReference(
  communityId,
  identification,
  reference
) {
  let resident = null;
  if(reference){
    resident = await CommunityUser.findOne({"reference": reference, "community": communityId}); 
  }
  else{
    let user = await User.findOne({"identification": identification});
    if(!user) return null;
    resident = await CommunityUser.findOne({"user": user._id, "community": communityId});
  }

  return resident;
}

async function residents(community, user) {
  return await peopleByKind(community, user, "RESIDENT");
}

async function security(community, user) {
  return await peopleByKind(community, user, "SECURITY");
}

async function admins(community, user) {
  return await peopleByKind(community, user, "ADMINISTRATOR");
}

async function peopleByKind(community, user, kind) {
  await findIfUserIsCommunitySecure(community, user);
  try {
    return await CommunityUser.find({ community, kind }).populate("user");
  } catch (e) {
    throw new ApiError("Comunidad no Encontrada", 404);
  }
}

async function approve(community, userToApprove, user) {
  await findIfUserIsGranted(community, user);
  try {
    const communityUser = await CommunityUser.findOne({
      community,
      user: userToApprove
    });
    communityUser.status = "APPROVED";
    await communityUser.save();
    return true;
  } catch (e) {
    throw new ApiError("Comunidad no Encontrada", 404);
  }
}

module.exports = {
  create,
  update,
  all,
  residents,
  security,
  admins,
  destroy,
  details,
  userCommunities,
  securityCommunities,
  people,
  requestAccess,
  approve,
  giveAccessBySecurity
};
