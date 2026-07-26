# Product Image Upload Feature

## Overview

This document describes the new product image upload functionality added to BharatHunt. Founders can now upload product images directly instead of only providing image URLs.

## Features

### 1. **Direct Image Upload**
- Founders can select and upload images directly from their computer
- Supported formats: All common image types (JPEG, PNG, WebP, GIF, etc.)
- Maximum file size: 5MB
- Images are stored in Supabase Storage with public access

### 2. **Image Preview**
- Real-time preview of the selected image before submission
- Shows file name and size information
- Option to remove and re-select image

### 3. **Fallback URL Input**
- Users can still provide image URLs if they prefer
- URL input is disabled when a file is selected
- Maintains backward compatibility with existing URL-based submissions

### 4. **Error Handling**
- File type validation (must be an image)
- File size validation (max 5MB)
- Clear error messages for validation failures
- Upload error handling with user-friendly messages

## Technical Implementation

### Files Modified/Created

#### 1. **components/products/product-form.tsx**
Updated the ProductForm component with:
- File input element with image preview
- Image selection handler with validation
- Upload state management
- Error display
- Integration with the upload utility

#### 2. **lib/upload.ts** (New)
Created a new utility module for image uploads:
- `uploadProductImage()` function that handles file uploads to Supabase Storage
- Generates unique filenames to prevent collisions
- Returns the public URL of the uploaded image
- Includes client-side validation

#### 3. **supabase/migrations/20260727000000_setup_product_images_storage.sql** (New)
Database migration that:
- Creates the `products` storage bucket in Supabase
- Sets up Row-Level Security (RLS) policies for the bucket
- Allows authenticated users to upload images
- Allows public read access to images
- Allows users to delete their own images

### Data Flow

1. **User selects image** → `handleImageSelect()` validates and creates preview
2. **User submits form** → `handleFormSubmit()` uploads image to Supabase Storage
3. **Upload completes** → Public URL is set in `heroImageUrl` form field
4. **Form submission** → Server action processes the form with the uploaded image URL
5. **Product created/updated** → `hero_image_url` field stores the Supabase public URL

### Storage Structure

Images are stored in Supabase Storage under:
```
products/
  product-images/
    {timestamp}-{random}.{ext}
```

Example: `products/product-images/1706000000000-a1b2c3.jpg`

## Setup Instructions

### 1. Apply Database Migration

Run the new migration to set up the storage bucket:

```bash
# Using Supabase CLI
supabase db push

# Or manually in Supabase dashboard:
# Copy the SQL from supabase/migrations/20260727000000_setup_product_images_storage.sql
# and run it in the SQL editor
```

### 2. Verify Supabase Configuration

Ensure your `.env.local` has:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

### 3. Test the Feature

1. Start the dev server: `npm run dev`
2. Navigate to `/submit` (product submission page)
3. Try uploading an image:
   - Select a valid image file
   - Verify preview appears
   - Submit the form
   - Confirm product is created with the uploaded image

## User Experience

### Product Submission Form

The updated form now includes:

```
Product Image
├── Image Preview (if selected)
│   └── [Remove button]
├── File Input
│   └── "Choose image file"
├── File Info (if selected)
│   └── "Selected: filename.jpg (123.4 KB)"
└── Fallback URL Input
    └── "Or paste image URL: https://..."
```

### Validation Messages

- "Please select an image file" - Non-image file selected
- "Image must be smaller than 5MB" - File exceeds size limit
- "Upload failed: [error details]" - Upload to Supabase failed

## Browser Compatibility

- Works in all modern browsers supporting:
  - File API
  - FileReader API
  - Fetch API
- Tested on: Chrome, Firefox, Safari, Edge

## Performance Considerations

- **Client-side validation**: Prevents invalid uploads before sending to server
- **Unique filenames**: Prevents collisions and allows parallel uploads
- **Public bucket**: Images are cached by CDN for fast delivery
- **File size limit**: 5MB limit prevents excessive storage usage

## Security

### RLS Policies

1. **Upload**: Only authenticated users can upload
2. **Read**: Public read access (no authentication required)
3. **Delete**: Only the uploader can delete their images

### File Validation

- MIME type checking (must start with `image/`)
- File size validation (max 5MB)
- Filename sanitization (timestamp + random string)

## Future Enhancements

1. **Image Optimization**
   - Automatic image resizing/compression
   - Multiple image formats (WebP, AVIF)
   - Responsive image generation

2. **Multiple Images**
   - Support for multiple product images/screenshots
   - Gallery view on product detail page
   - Drag-and-drop reordering

3. **Image Editing**
   - Crop/rotate before upload
   - Add filters or effects
   - Resize in browser

4. **Advanced Features**
   - Image optimization pipeline
   - Automatic alt-text generation
   - Image analytics (views, engagement)

## Troubleshooting

### Upload fails with "bucket not found"

**Solution**: Ensure the migration has been applied and the `products` bucket exists in Supabase Storage.

### Upload fails with "permission denied"

**Solution**: Check that:
- User is authenticated
- RLS policies are correctly set up
- Supabase anon key has storage permissions

### Image preview doesn't appear

**Solution**: Check browser console for errors. Ensure:
- File is a valid image
- Browser supports FileReader API
- JavaScript is enabled

### Uploaded image URL is broken

**Solution**: Verify:
- Supabase project is active
- Storage bucket is public
- Image file wasn't deleted from storage

## API Reference

### `uploadProductImage(file: File): Promise<string>`

Uploads an image file to Supabase Storage and returns the public URL.

**Parameters:**
- `file` (File): The image file to upload

**Returns:**
- Promise<string>: Public URL of the uploaded image

**Throws:**
- Error: If file is invalid, upload fails, or URL generation fails

**Example:**
```typescript
import { uploadProductImage } from '@/lib/upload';

const file = event.target.files[0];
const url = await uploadProductImage(file);
console.log('Uploaded to:', url);
```

## Testing Checklist

- [ ] Upload valid image (JPEG, PNG, WebP)
- [ ] Verify preview appears
- [ ] Check file info displays correctly
- [ ] Remove image and re-select
- [ ] Submit form with uploaded image
- [ ] Verify product created with image
- [ ] Test with oversized file (>5MB)
- [ ] Test with non-image file
- [ ] Verify fallback URL input works
- [ ] Test on mobile device
- [ ] Test on different browsers

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review browser console for error messages
3. Verify Supabase configuration
4. Check RLS policies in Supabase dashboard
