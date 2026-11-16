import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireSupplier } from '../auth.js';

const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://10.0.2.2:3000').replace(/\/+$/, '');

/** Dossier des images produit, servi publiquement par /uploads (voir server.js). */
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_TYPES = /^image\/(jpeg|png|webp|gif|heic|heif)$/;
const MAX_BYTES = 5 * 1024 * 1024; // 5 Mo

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg')
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '')
      .slice(0, 8);
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `product-${unique}${ext || '.jpg'}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_TYPES.test(file.mimetype || '')) {
      return cb(new Error('format_image'));
    }
    return cb(null, true);
  },
});

const router = Router();

/**
 * POST /api/uploads/product-image — (fournisseur) envoie une photo de produit.
 * Champ multipart « image ». Répond { url } (URL absolue, ex: http://10.0.2.2:3000/uploads/product-…jpg).
 */
router.post('/product-image', requireAuth, requireSupplier, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Image trop volumineuse (5 Mo maximum).'
          : err.message === 'format_image'
            ? 'Format d’image non pris en charge (JPEG, PNG, WebP, GIF).'
            : 'Envoi impossible, réessayez.';
      return res.status(400).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Aucune image reçue (champ « image » manquant).' });
    }
    return res.status(201).json({ url: `${PUBLIC_URL}/uploads/${req.file.filename}` });
  });
});

export { UPLOAD_DIR };
export default router;
