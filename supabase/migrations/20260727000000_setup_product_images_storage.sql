-- Create storage bucket for product images\nINSERT INTO storage.buckets (id, name, public)
VALUES ('products', 'products', true)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies for the products bucket\nCREATE POLICY \"Allow authenticated users to upload product images\"\nON storage.objects FOR INSERT\nWITH CHECK (\n  bucket_id = 'products' AND\n  auth.role() = 'authenticated'\n);\n\nCREATE POLICY \"Allow public read access to product images\"\nON storage.objects FOR SELECT\nUSING (bucket_id = 'products');\n\nCREATE POLICY \"Allow users to delete their own product images\"\nON storage.objects FOR DELETE\nUSING (\n  bucket_id = 'products' AND\n  auth.role() = 'authenticated'\n);\n"
