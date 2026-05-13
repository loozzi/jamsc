import { Router } from 'express';
import * as mediaController from '../controllers/mediaController';

const router = Router();

router.get('/resolve', mediaController.resolveUrl);
router.get('/resolve-playlist', mediaController.resolvePlaylist);
router.get('/resolve-spotify', mediaController.resolveSpotify);
router.get('/youtube-search-first', mediaController.searchFirst);

export default router;
