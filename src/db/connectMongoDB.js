import mongoose from 'mongoose';

export const connectMongoDB = async () => {
  try {
    const mongoURL = process.env.MONGO_URL;
    if (!mongoURL) {
      throw new Error('MONGO_URL is not defined in environment variables');
    }
    await mongoose.connect(mongoURL);
    console.log('✅ MongoDB connection established successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};
