import test from 'node:test';
import assert from 'node:assert/strict';
import { youtubeVideoId, isImageMedia } from '../src/lib/mediaPresentation';

test('YouTube demonstrations support watch, short, Shorts, live and embed links', () => {
  const id = 'Abcdef_1234';
  for (const value of [`https://youtu.be/${id}?t=10`, `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/shorts/${id}`, `https://www.youtube-nocookie.com/embed/${id}`, `https://m.youtube.com/live/${id}`]) {
    assert.equal(youtubeVideoId(value), id);
  }
  for (const value of ['https://youtube.com.evil.invalid/watch?v=Abcdef_1234', 'storage://exercise-videos/video.mp4', 'https://youtu.be/invalid']) {
    assert.equal(youtubeVideoId(value), null);
  }
});

test('GIF demonstrations are images even in private references and signed URLs', () => {
  assert.equal(isImageMedia('storage://exercise-videos/exercises/squat.gif'), true);
  assert.equal(isImageMedia('https://example.test/squat.GIF?token=temporary'), true);
  assert.equal(isImageMedia('https://example.test/squat.mp4'), false);
});
