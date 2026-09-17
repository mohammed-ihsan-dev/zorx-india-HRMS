import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Employee } from '../models/Employee.js';

const MAPPINGS = [
  { email: 'shamilasherin.08@gmail.com', profileImage: '/profile/shamila.png' },
  { email: 'mizhab107@gmail.com', profileImage: '/profile/mishab.jpeg' },
  { email: 'shijinp9404@gmail.com', profileImage: '/profile/shijin.jpeg' },
  { email: 'neethurkailas@gmail.com', profileImage: '/profile/neethu.jpeg' },
  { email: 'nahidasherin01@gmail.com', profileImage: '/profile/nahida.jpeg' },
  { email: 'ajmalmuhmmd777@gmail.com', profileImage: '/profile/ajmal.jpeg' },
  { email: 'mdihsan0010@gmail.com', profileImage: '/profile/ihsan.jpeg' },
];

async function updateProfileImages() {
  await connectDB();
  console.log('[updateProfileImages] Starting profile picture migration...');

  for (const item of MAPPINGS) {
    const user = await User.findOne({ email: item.email.toLowerCase().trim() });
    if (!user) {
      console.warn(`[updateProfileImages] User not found for email: ${item.email}`);
      continue;
    }

    const employee = await Employee.findOne({ userId: user._id });
    if (!employee) {
      console.warn(`[updateProfileImages] Employee record not found for user: ${item.email}`);
      continue;
    }

    employee.profileImage = item.profileImage;
    await employee.save();
    console.log(`[updateProfileImages] Updated ${user.email} -> ${item.profileImage}`);
  }

  console.log('[updateProfileImages] Profile picture migration complete!');
  await disconnectDB();
  process.exit(0);
}

updateProfileImages().catch((err) => {
  console.error('[updateProfileImages] Error:', err);
  process.exit(1);
});
