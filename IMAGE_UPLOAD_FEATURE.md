# Product Image Upload Feature (Cloudinary)

## Overview

This document describes the product image upload functionality added to BharatHunt using **Cloudinary**. Founders can now upload product images directly instead of only providing image URLs.

## Features

### 1. **Direct Image Upload**
- Founders can select and upload images directly from their computer
- Images are stored securely in Cloudinary
- Maximum file size: 10MB (`MAX_UPLOAD_BYTES` in `lib/upload.ts`) — raised from 5MB
  because full-resolution screenshots were being compressed to fit, which is the
  blur the delivery transforms exist to avoid
- Gallery screenshots must be at least 800px wide (`MIN_GALLERY_IMAGE_WIDTH`);
  vector images, which report no intrinsic width, are exempt
- Automatic image optimization and delivery via Cloudinary CDN

### 2. **Hero Image + Gallery**
- One hero image plus up to `MAX_GALLERY_IMAGES` gallery screenshots
- Gallery files upload as they are picked; the hero uploads on submit

### 3. **Image Preview**
- Real-time preview of the selected image before submission
- Shows file name and size information
- Option to remove and re-select image

### 4. **Fallback URL Input**
- Users can still provide image URLs if they prefer
- URL input is disabled when a file is selected
- Maintains backward compatibility with existing URL-based submissions

### 5. **Error Handling**
- File type validation (must be an image)
- File size validation (max 10MB) and minimum-width validation for gallery images
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
- Integration with the Cloudinary upload utility

#### 2. **lib/upload.ts**
Updated utility module for Cloudinary uploads:
- `uploadProductImage()` function that handles file uploads to Cloudinary API
- Uses unsigned upload presets for client-side security
- Returns the secure URL of the uploaded image

### Data Flow

1. **User selects image** → `handleImageSelect()` validates and creates preview
2. **User submits form** → `handleFormSubmit()` uploads image to Cloudinary
3. **Upload completes** → Secure URL is set in `heroImageUrl` form field
4. **Form submission** → Server action processes the form with the Cloudinary URL
5. **Product created/updated** → `hero_image_url` field stores the Cloudinary secure URL

## Setup Instructions

### 1. Cloudinary Account Setup (CRITICAL)

1. Create a free account at [Cloudinary](https://cloudinary.com/)
2. Go to **Settings** (gear icon) > **Upload**
3. Scroll down to **Upload presets** and click **Add upload preset**.
4. **IMPORTANT**: Change **Signing Mode** from `Signed` to `Unsigned`. 
   - If you don't do this, you will get the error: *"Upload preset must be whitelisted for unsigned uploads"*.
5. Copy the **Upload preset name** (it will be a random string or the name you gave it).
6. Click **Save** at the top right.

### 2. Configure Environment Variables

Add the following to your `.env.local`:

```bash
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your_unsigned_upload_preset
```

### 3. Test the Feature

1. Start the dev server: `npm run dev`
2. Navigate to `/submit` (product submission page)
3. Try uploading an image:
   - Select a valid image file
   - Verify preview appears
   - Submit the form
   - Confirm product is created with the Cloudinary image URL

## Performance Considerations

- **Cloudinary CDN**: Images are automatically optimized and served via a global CDN
- **On-the-fly Transformations**: Cloudinary allows for dynamic resizing and formatting by modifying the URL
- **Client-side validation**: Prevents invalid uploads before sending to Cloudinary

## Security

- **Unsigned Uploads**: Uses restricted upload presets to allow client-side uploads without exposing sensitive API secrets
- **File Validation**: MIME type and size checking performed before upload

## Future Enhancements

1. **Signed uploads**
   - The preset is unsigned, so the cloud name and preset in the page source let
     anyone upload to this account. A server route that signs upload params with
     `CLOUDINARY_API_SECRET` would close that, at the cost of one round trip.

2. **Watermarks or overlays**
   - Resizing and AVIF/WebP selection already ship — see `lib/cloudinary.ts`,
     which builds `f_auto,q_auto,c_limit` variants and 1x/2x/3x srcSets at
     delivery time. Watermarking would slot in the same way.

## Troubleshooting

### Upload fails with "Upload preset must be whitelisted for unsigned uploads"

The preset named by `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` exists, but its
**Signing Mode is `Signed`**. `lib/upload.ts` posts from the browser with no
signature, so Cloudinary refuses it. (A preset that did not exist at all would
fail with *"Upload preset not found"* instead — the wording tells you which
problem you have.)

**Solution**: Cloudinary console → **Settings → Upload → Upload presets** → your
preset → **Signing Mode: Unsigned** → Save. Nothing in this repo can override
it; `Signed` is Cloudinary's default for new presets, so this bites again every
time a preset is recreated. Check the environment too — production reads the
variables from Vercel, not from `.env.local`.

### Upload fails with "Invalid cloud name"

**Solution**: Verify `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` matches your Cloudinary dashboard.

### Upload fails with "Upload preset not found"

**Solution**: Ensure you've created an **Unsigned** upload preset in Cloudinary and correctly set `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`.

### Image preview doesn't appear

**Solution**: Check browser console for errors. Ensure the file is a valid image and the browser supports FileReader API.

## API Reference

### `uploadProductImage(file: File): Promise<string>`

Uploads an image file to Cloudinary and returns the secure URL.

**Parameters:**
- `file` (File): The image file to upload

**Returns:**
- Promise<string>: Secure URL of the uploaded image

**Options:**
- `minWidth` (number): reject images narrower than this. Pass
  `MIN_GALLERY_IMAGE_WIDTH` for gallery screenshots; omit for logos and vectors.

**Example:**
```typescript
import { uploadProductImage } from '@/lib/upload';

const file = event.target.files[0];
const url = await uploadProductImage(file);
console.log('Uploaded to Cloudinary:', url);
```
