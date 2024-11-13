import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      file?: Express.Multer.File;  // If you're using multer
      files?: Express.Multer.File[]; // For multiple files
    }
  }
}