const { Community, CommunityUser, User, Visit } = require("../models");
const { findIfUserIsGranted, findIfUserIsCommunitySecure } = require("./utils");
const moment = require("moment-timezone");
const mongoose = require("mongoose");

async function visitsTypeCountByMonth(community, month, user) {
  // const from = moment()
  //   .tz(user.timezone)
  //   // .date(1)
  //   // .month(month - 1)
  //   .format("YYYY-MM-DD");
  // const to = moment(from).add(30, "days").format("YYYY-MM-DD");
  const from = moment().tz(user.timezone).startOf('month').format('YYYY-MM-DD');
  const to   = moment().tz(user.timezone).endOf('month').format('YYYY-MM-DD');
  const result = [];
  result[0] = await countByType(community, from, to, "SCHEDULED");
  result[1] = await countByType(community, from, to, "FREQUENT");
  result[2] = await countByType(community, from, to, "SPORADIC");
  result[3] = await countByType(community, from, to, "NOT EXPECTED");

  return result;
}
// a85651
async function visitCountByMonth(community, month, user) {
  // let from = moment()
  //   .tz(user.timezone)
  //   .date(1)
  //   .month(month - 1)
    // .format("YYYY-MM-DD");
  let from = moment().tz(user.timezone).startOf('month').format('YYYY-MM-DD');
  let to = moment(from).add(7, "days");
  let total = [];
  for (let i = 0; i < 4; i++) {
    total[i] = await countByType(community, from, to);
    from = to;
    to = moment(to).add(7, "days");
  }
  return total;
}

async function countByType(community, from, to, type) {
  const visits = await findVisitsBetween(community, from, to, type);
  return visits.length;
}

async function findVisitsBetween(community, from, to, type) {
  const match = {
    community: mongoose.Types.ObjectId(community),
    "checks.created_at": {
      $gte: new Date(from),
      $lt: new Date(to)
    }
  };

  if (type) match.kind = type;

  return await Visit.aggregate([
    {
      $lookup: {
        from: "checks",
        localField: "_id",
        foreignField: "visit",
        as: "checks"
      }
    },
    {
      $match: match
    }
  ]);
}
async function countByPartOfDay(community, month, user) {
  const from = moment().tz(user.timezone).startOf('month').format('YYYY-MM-DD');
  const to = moment(from).add(30, "days");
  const visits = await findVisitsBetween(community, from, to);
  const result = [];
  result[3] = visits.filter(i => i.partOfDay === "ALL DAY").length;
  result[0] = visits.filter(i => i.partOfDay === "MORNING").length;
  result[2] = visits.filter(i => i.partOfDay === "NIGHT").length;
  result[1] = visits.filter(i => i.partOfDay === "AFTERNOON").length;
  result[4] = visits.filter(i => !i.partOfDay).length;
  return result;
}

module.exports = {
  visitCountByMonth,
  visitsTypeCountByMonth,
  countByPartOfDay
};
