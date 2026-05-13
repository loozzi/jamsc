import { NextFunction, Request, Response } from 'express';
import * as mediaService from '../services/mediaService';
import { AppError } from '../middlewares/errorHandler';

export async function resolveUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') throw new AppError(400, 'URL is required');
    const result = await mediaService.resolveUrl(url);
    if (!result) throw new AppError(400, 'URL không được hỗ trợ. Hãy dùng link YouTube hoặc SoundCloud.');
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function resolvePlaylist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') throw new AppError(400, 'URL is required');
    const tracks = await mediaService.resolvePlaylist(url);
    if (!tracks || tracks.length === 0) throw new AppError(400, 'Không thể tải playlist. Hãy kiểm tra link và thử lại.');
    res.json({ tracks });
  } catch (err) {
    next(err);
  }
}

export async function resolveSpotify(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') throw new AppError(400, 'URL là bắt buộc');
    if (!url.includes('open.spotify.com/track/')) {
      throw new AppError(400, 'Chỉ hỗ trợ link track Spotify (open.spotify.com/track/...)');
    }
    const result = await mediaService.resolveSpotify(url);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function searchFirst(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) throw new AppError(400, 'Nhập từ khóa tìm kiếm.');
    const track = await mediaService.searchFirst(q);
    if (!track) throw new AppError(404, 'Không tìm thấy video có thể phát nhúng. Thử từ khóa khác.');
    res.json({ track });
  } catch (err) {
    next(err);
  }
}
