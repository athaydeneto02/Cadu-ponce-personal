-- Match the GIF format accepted by the exercise editor, preserving access and size limits.
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'image/gif')
WHERE id = 'exercise-videos'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('image/gif' = ANY(allowed_mime_types));
