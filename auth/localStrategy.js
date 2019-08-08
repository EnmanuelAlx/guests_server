const LocalStrategy = require("passport-local");
const { User } = require("../models");

module.exports = new LocalStrategy(
  {
    usernameField: "email",
    passwordField: "password",
    session: false
  },
  authenticate
);

async function authenticate(email, password, done) {
  let user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.password || !user.validPassword(password))
    return done(null, false);
  return done(null, user);
}
