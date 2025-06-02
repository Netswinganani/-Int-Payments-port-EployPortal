import bcrypt from 'bcrypt';

const password = 'AdminPassword2';
const saltRounds = 12;

bcrypt.hash(password, saltRounds).then((hashed) => {
  console.log('Hashed password:', hashed);
}).catch((err) => {
  console.error('Error hashing password:', err);
});
