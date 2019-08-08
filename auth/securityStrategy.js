const LocalStrategy = require("passport-local");
const { User, CommunityUser } = require("../models");

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

  if (!user.password) return done(null, false);
  if (!user || !user.validPassword(password)) return done(null, false);

  let count = await CommunityUser.count({
    user: user.id,
    kind: "SECURITY"
  });

  return count > 0 ? done(null, user) : done(null, false);
}
