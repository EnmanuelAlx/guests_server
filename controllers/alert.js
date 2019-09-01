const { Alert, CommunityUser, User } = require("../models");
const ApiError = require("../utils/ApiError");
const mongoose = require("mongoose");
const { findIfUserIsOnCommunity } = require("./utils");
const OneSignal = require("../oneSignal");
const Webhooks = require("./webhook");
// TODO SECURE THIS ROUTE!
async function create(info, author) {
  await findIfUserIsOnCommunity(info.community, author);
  try {
    info.author = author;
    let alert = new Alert(info);
    await alert.save();
    await sendAlert(alert);
    await runOnAlertWebhook(alert);
    return alert;
  } catch (e) {
    throw new ApiError("Error en los datos ingresados", 400);
  }
}

async function runOnAlertWebhook(alert) {
  try {
    if (alert.kind !== "OTHER")
      await Webhook.run(alert.community, "ON_" + alert.kind, alert);
  } catch (error) {}
}

async function update(id, AlertInfo, user) {
  await findIfUserIsGranted(id, user);
  let alert = await Alert.findOne({ _id: id });
  alert.set(AlertInfo);
  await alert.save();
  return alert;
}

async function destroy(id, user) {
  await findIfUserIsGranted(id, user);
  let alert = await Alert.findOne({ _id: id });
  await alert.remove();
  return true;
}

async function userAlerts(user, kind, skip, limit) {
  console.log({user, kind, skip, limit});
  const communityUsers = await CommunityUser.find({ user, status: "APPROVED" });
  const communities = communityUsers.map(item => item.community);
  const alerts = await Alert.find({ community: { $in: communities }, kind })
    .populate("community")
    .populate("author", User.Selector)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit);
  return { alerts };
}

async function sendAlert(alert) {
  User.populate(alert, { path: "author" });
  const communityUsers = await CommunityUser.find({
    community: alert.community
  }).populate("user");
  const receivers = communityUsers
    .filter(item => item.user._id.toString() != alert.author._id.toString())
    .reduce((prev, act) => {
      return prev.concat(act.user.devices ? act.user.devices : []);
    }, []);
  await OneSignal.send(receivers, "ALERT", alert);
}

module.exports = {
  create,
  update,
  destroy,
  userAlerts
};
