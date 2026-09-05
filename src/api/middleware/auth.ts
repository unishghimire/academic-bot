import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env.js';

export function requireAcademyAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const secretHeader = req.headers['x-academy-secret'];

  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : secretHeader;

  if (!token || token !== env.ACADEMY_API_SECRET) {
    res.status(401).json({ error: 'Unauthorized: Invalid Academy API Secret' });
    return;
  }

  next();
}
