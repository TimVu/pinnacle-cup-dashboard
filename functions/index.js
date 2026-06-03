/**
 * Pinnacle Cup Dashboard — Cloud Functions
 * ============================================================
 * transcodeTracer: Storage-triggered function that converts any
 * uploaded shot tracer video into Raspberry-Pi-compatible H.264 MP4.
 *
 * WHY: The Yodeck RPi player can only hardware-decode H.264. iPhone
 * videos are HEVC/H.265, which decode to 0x0 on the Pi (black box).
 * This function transcodes uploads to H.264 (baseline, yuv420p) so
 * they play on the clubhouse TV.
 *
 * FLOW:
 *   1. App uploads a video + creates a shotTracers doc with videoUrl.
 *   2. This function fires on the upload, transcodes to H.264,
 *      and writes the result to a new "-h264.mp4" path.
 *   3. It finds the shotTracers doc(s) pointing at the original file
 *      and rewrites videoUrl to the new H.264 URL.
 *   4. The dashboard's onSnapshot listener sees the changed URL and
 *      reloads the video cleanly (new path = no cache collision).
 * ============================================================
 */

const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { randomUUID } = require('crypto');

admin.initializeApp();
ffmpeg.setFfmpegPath(ffmpegStatic);

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
// Storage bucket — matches storageBucket in firebase-config.js
const BUCKET = 'pinnacle-cup-ios.firebasestorage.app';

// Function region — should match the bucket's location.
// Bucket confirmed in us-east1 (deploy error: "cannot listen to a bucket in region us-east1").
const REGION = 'us-east1';

// Only transcode objects under this path prefix.
// '' = process every uploaded video regardless of path (safe here:
// the only videos in this bucket are shot tracers; feed posts are images).
// If tracer videos land in a known folder, set e.g. 'shotTracers/' to narrow.
const PATH_PREFIX = '';

// Suffix marking our transcoded output (used for loop prevention)
const OUT_SUFFIX = '-h264';

exports.transcodeTracer = onObjectFinalized(
  {
    bucket: BUCKET,
    region: REGION,
    memory: '2GiB',
    cpu: 2,
    timeoutSeconds: 300,
  },
  async (event) => {
    const obj = event.data;
    const filePath = obj.name || '';
    const contentType = obj.contentType || '';

    // ── Guards ──────────────────────────────────────────────
    if (PATH_PREFIX && !filePath.startsWith(PATH_PREFIX)) {
      return logger.info(`skip (path): ${filePath}`);
    }
    if (!contentType.startsWith('video/')) {
      return logger.info(`skip (not video): ${filePath} [${contentType}]`);
    }
    // Loop prevention: don't re-process our own output
    const stem = path.basename(filePath, path.extname(filePath));
    if (stem.endsWith(OUT_SUFFIX)) {
      return logger.info(`skip (already our output): ${filePath}`);
    }
    if (obj.metadata && obj.metadata.transcoded === 'true') {
      return logger.info(`skip (flagged transcoded): ${filePath}`);
    }

    const bucket = admin.storage().bucket(obj.bucket);
    const dir = path.posix.dirname(filePath);
    const outPath = path.posix.join(dir === '.' ? '' : dir, `${stem}${OUT_SUFFIX}.mp4`);
    const tmpIn = path.join(os.tmpdir(), `in-${Date.now()}-${path.basename(filePath)}`);
    const tmpOut = path.join(os.tmpdir(), `out-${Date.now()}.mp4`);

    try {
      // 1. Download the original
      await bucket.file(filePath).download({ destination: tmpIn });
      logger.info(`downloaded ${filePath}`);

      // 2. Transcode to Pi-compatible H.264
      await new Promise((resolve, reject) => {
        ffmpeg(tmpIn)
          .videoCodec('libx264')
          .audioCodec('aac')
          .videoFilters("scale=-2:'min(720,ih)'") // cap HEIGHT at 720: a 4:3 source becomes 960x720, not 1280x960 (~44% fewer pixels)
          .fps(30)                                  // cap 30fps — halves decode load for 60fps phone video
          .outputOptions([
            '-profile:v', 'baseline',   // no B-frames — simplest, smoothest decode on the Pi
            '-level', '3.1',
            '-pix_fmt', 'yuv420p',      // critical: Pi can't decode yuv422/444
            '-maxrate', '2000k',        // cap peak bitrate so the Pi decoder keeps up
            '-bufsize', '4000k',
            '-movflags', '+faststart',  // moov atom up front for fast web start
            '-preset', 'veryfast',      // short clips — speed over compression
            '-crf', '23',               // good visual quality
          ])
          .on('start', (cmd) => logger.info(`ffmpeg start: ${cmd}`))
          .on('end', resolve)
          .on('error', reject)
          .save(tmpOut);
      });
      logger.info(`transcoded -> ${outPath}`);

      // 3. Upload H.264 to the new path with a Firebase download token
      const token = randomUUID();
      await bucket.upload(tmpOut, {
        destination: outPath,
        metadata: {
          contentType: 'video/mp4',
          cacheControl: 'public, max-age=86400',
          metadata: {
            transcoded: 'true',
            firebaseStorageDownloadTokens: token,
          },
        },
      });
      const newUrl =
        `https://firebasestorage.googleapis.com/v0/b/${obj.bucket}` +
        `/o/${encodeURIComponent(outPath)}?alt=media&token=${token}`;
      logger.info(`uploaded H.264, url ...${newUrl.slice(-40)}`);

      // 4. Repoint the shotTracers doc(s) at the new URL.
      //    Match by the original file path appearing in videoUrl
      //    (handles both raw and URL-encoded forms).
      const db = admin.firestore();
      const snap = await db.collection('shotTracers').get();
      const encodedOrig = encodeURIComponent(filePath);
      let updated = 0;
      const writes = [];
      snap.forEach((doc) => {
        const vu = doc.data().videoUrl || '';
        if (vu.includes(encodedOrig) || vu.includes(filePath)) {
          writes.push(doc.ref.update({ videoUrl: newUrl, transcoded: true }));
          updated++;
        }
      });
      await Promise.all(writes);
      logger.info(`updated ${updated} shotTracers doc(s)`);

      if (updated === 0) {
        // Doc may not exist yet (created after upload). Leave the H.264 file
        // in place; the app can also be pointed at the "-h264.mp4" path.
        logger.warn(`no shotTracers doc matched ${filePath} yet`);
      }
    } catch (err) {
      logger.error(`transcode failed for ${filePath}`, err);
      throw err;
    } finally {
      for (const f of [tmpIn, tmpOut]) {
        try { fs.unlinkSync(f); } catch (_) { /* ignore */ }
      }
    }
  }
);
