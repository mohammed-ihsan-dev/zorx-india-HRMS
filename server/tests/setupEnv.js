process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/zorx-ms-test-placeholder';
process.env.MONGODB_DB = 'zorx-ms-test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.OFFICE_LATITUDE = '10.991401';
process.env.OFFICE_LONGITUDE = '76.442772';
process.env.OFFICE_ATTENDANCE_RADIUS = '200';
process.env.WORKING_START_TIME = '09:30';
process.env.WORKING_END_TIME = '18:00';
process.env.BREAK_DURATION_MINUTES = '60';
process.env.LATE_THRESHOLD_MINUTES = '15';
process.env.HALF_DAY_THRESHOLD_MINUTES = '240';
// Never use the real Cloudinary account from tests (server/.env is loaded by
// dotenv, which does not override variables that are already set).
process.env.CLOUDINARY_URL = '';
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
