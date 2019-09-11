const { User } = require("../models");
const { simpleMail } = require("../mailer");
const { generateAuthToken } = require("../auth/utils");
const ApiError = require("../utils/ApiError");
const mkdirp = require("mkdirp");

async function auth(user) {
  if (user) {
    var token = generateAuthToken(user);
    return { token: token, user: user };
  }
  throw new ApiError("Parametros de Ingreso Incorrectos", 401);
}

async function create(info, image) {
  try {
    info.email = info.email.toLowerCase();
    let user = await User.findOne({ identification: info.identification });
    if (!user) user = new User();
    if (!user.password || user.password == "") user.set(info);
    else throw new ApiError("La cedula o el correo esta repetido", 409);

    if (image) {
      let imageUrl = await uploadImage(user, image);
      user.image = imageUrl;
    }
    await user.save();
    return auth(user);
  } catch (e) {
    console.log("{USER} Error Creating:", e);
    if ((e.code && e.code == 11000) || e.status == 409)
      throw new ApiError("La cedula o el correo esta repetido", 409);
    throw new ApiError("Error en los parametros ingresados", 400);
  }
}

async function addDevice(device, user) {
  return User.findOneAndUpdate({ _id: user }, { $push: { devices: device } });
}

async function removeDevice(device, user) {
  return User.findOneAndUpdate({ _id: user }, { $pull: { devices: device } });
}

async function uploadImage(user, image) {
  const URL = process.env.URL || "http://localhost:3000";
  return new Promise((resolve, reject) => {
    image.mv(`storage/${image.name}`, err => {
      if (err) reject(err);
      resolve(`${URL}/storage/${image.name}`);
    });
  });
}

async function profile(id) {
  let user = await User.findOne({ _id: id }).lean();
  return user;
}

async function update(id, user, image) {
  let userUpdated = await User.findOne({
    _id: id
  });
  user.address =
    user.address && typeof user.address == "string"
      ? JSON.parse(user.address)
      : user.address;
  userUpdated.set(user);
  if (image) {
    let imageUrl = await uploadImage(userUpdated, image);
    userUpdated.image = imageUrl;
  }
  await userUpdated.save();
  return { user: userUpdated };
}

async function forgotPassword(email) {
  const user = await User.findOne({ email: email });
  if (!user) throw new ApiError("Usuario no encontrado", 404);

  const code = Math.floor(Math.random() * Math.pow(10, 6));
  user.code = code; // TODO Encrypt this!

  await user.save();
  const success = await simpleMail(
    `Aqui esta tu codigo: ${code}`,
    "Codigo de Cambio de Contraseña",
    user.email
  );
  return { success };
}

async function verifyCode(email, code) {
  console.log("US ", email, code);
  const user = await User.findOne({ email, code });
  if (!user) throw new ApiError("Usuario no encontrado", 404);
  return { success: true };
}

async function changePassword(email, code, password) {
  const user = await User.findOne({ email, code });
  if (!user) throw new ApiError("Usuario no encontrado", 404);
  user.set("password", password);
  await user.save();
  return { success: true };
}

async function findFirstIdentificationMatch(identification) {
  return await User.findOne({
    identification: { $regex: identification, $options: "i" }
  });
}

async function find(query, page) {
  const results = await User.find({
    $or: [
      { name: { $regex: query, $options: "i" } },
      { identification: { $regex: query, $options: "i" } },
      { email: { $regex: query, $options: "i" } }
    ]
  })
    .skip((page - 1) * 30)
    .limit(30);
  return { results, pagination: { more: results.length === 30 } };
}

module.exports = {
  auth,
  create,
  update,
  profile,
  addDevice,
  find,
  findFirstIdentificationMatch,
  removeDevice,
  forgotPassword,
  verifyCode,
  changePassword
};
