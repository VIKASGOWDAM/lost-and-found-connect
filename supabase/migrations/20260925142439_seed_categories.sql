/*
# Seed Categories and Category Fields

## Overview
Seeds the categories table with 13 top-level categories and their dynamic form fields.
Each category has 3-6 fields with a mix of public (visible to everyone) and private
(verification-only, visible to report owner) fields.

## Categories Seeded
Electronics, Mobile Phones, Laptops, Documents, ATM/Bank Cards, Jewellery, Wallets,
Bags, Student Items, Vehicles, Clothing, Books, Other

## Field Types
- text: free text input
- select: dropdown (options stored in field_label as hint)
- number: numeric input
- date: date picker
- boolean: checkbox

## Public vs Private
- is_public_default=true: shown to everyone on the browse/detail page
- is_public_default=false: only visible to the report owner; used for verification
*/

-- Helper to get category id by name
CREATE OR REPLACE FUNCTION get_category_id(cat_name text)
RETURNS uuid AS $$
  SELECT id FROM categories WHERE name = cat_name LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ============ INSERT CATEGORIES ============
INSERT INTO categories (name) VALUES
  ('Electronics'),
  ('Mobile Phones'),
  ('Laptops'),
  ('Documents'),
  ('ATM/Bank Cards'),
  ('Jewellery'),
  ('Wallets'),
  ('Bags'),
  ('Student Items'),
  ('Vehicles'),
  ('Clothing'),
  ('Books'),
  ('Other')
ON CONFLICT DO NOTHING;

-- ============ ELECTRONICS ============
INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'item_type', 'Item Type', 'text', true, true FROM categories c WHERE c.name = 'Electronics'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'brand', 'Brand', 'text', true, false FROM categories c WHERE c.name = 'Electronics'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'color', 'Color', 'text', true, false FROM categories c WHERE c.name = 'Electronics'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'serial_number', 'Serial Number', 'text', false, false FROM categories c WHERE c.name = 'Electronics'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'distinguishing_marks', 'Distinguishing Marks or Damage', 'text', false, false FROM categories c WHERE c.name = 'Electronics'
ON CONFLICT DO NOTHING;

-- ============ MOBILE PHONES ============
INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'brand', 'Brand', 'text', true, true FROM categories c WHERE c.name = 'Mobile Phones'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'model', 'Model', 'text', true, true FROM categories c WHERE c.name = 'Mobile Phones'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'color', 'Color', 'text', true, false FROM categories c WHERE c.name = 'Mobile Phones'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'imei', 'IMEI Number', 'text', false, false FROM categories c WHERE c.name = 'Mobile Phones'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'lock_screen_wallpaper', 'Lock Screen Wallpaper Description', 'text', false, false FROM categories c WHERE c.name = 'Mobile Phones'
ON CONFLICT DO NOTHING;

-- ============ LAPTOPS ============
INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'brand', 'Brand', 'text', true, true FROM categories c WHERE c.name = 'Laptops'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'model', 'Model', 'text', true, false FROM categories c WHERE c.name = 'Laptops'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'color', 'Color', 'text', true, false FROM categories c WHERE c.name = 'Laptops'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'serial_number', 'Serial Number', 'text', false, false FROM categories c WHERE c.name = 'Laptops'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'sticker_marks', 'Stickers or Distinguishing Marks', 'text', false, false FROM categories c WHERE c.name = 'Laptops'
ON CONFLICT DO NOTHING;

-- ============ DOCUMENTS ============
INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'document_type', 'Document Type', 'select', true, true FROM categories c WHERE c.name = 'Documents'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'issuing_authority', 'Issuing Authority', 'text', true, true FROM categories c WHERE c.name = 'Documents'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'document_number', 'Document Number', 'text', false, false FROM categories c WHERE c.name = 'Documents'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'name_on_document', 'Name on Document', 'text', false, false FROM categories c WHERE c.name = 'Documents'
ON CONFLICT DO NOTHING;

-- ============ ATM/BANK CARDS ============
INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'bank_name', 'Bank Name', 'text', true, true FROM categories c WHERE c.name = 'ATM/Bank Cards'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'card_type', 'Card Type', 'select', true, false FROM categories c WHERE c.name = 'ATM/Bank Cards'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'card_color', 'Card Color', 'text', true, false FROM categories c WHERE c.name = 'ATM/Bank Cards'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'last_four_digits', 'Last Four Digits', 'text', false, false FROM categories c WHERE c.name = 'ATM/Bank Cards'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'name_on_card', 'Name on Card', 'text', false, false FROM categories c WHERE c.name = 'ATM/Bank Cards'
ON CONFLICT DO NOTHING;

-- ============ JEWELLERY ============
INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'item_type', 'Item Type', 'text', true, true FROM categories c WHERE c.name = 'Jewellery'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'material', 'Material', 'text', true, false FROM categories c WHERE c.name = 'Jewellery'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'color', 'Color', 'text', true, false FROM categories c WHERE c.name = 'Jewellery'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'engraving', 'Engraving or Inscription', 'text', false, false FROM categories c WHERE c.name = 'Jewellery'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'estimated_value', 'Estimated Value', 'text', false, false FROM categories c WHERE c.name = 'Jewellery'
ON CONFLICT DO NOTHING;

-- ============ WALLETS ============
INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'wallet_type', 'Wallet Type', 'select', true, true FROM categories c WHERE c.name = 'Wallets'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'color', 'Color', 'text', true, false FROM categories c WHERE c.name = 'Wallets'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'brand', 'Brand', 'text', true, false FROM categories c WHERE c.name = 'Wallets'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'contents', 'Contents Description', 'text', false, false FROM categories c WHERE c.name = 'Wallets'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'id_inside', 'IDs or Cards Inside', 'text', false, false FROM categories c WHERE c.name = 'Wallets'
ON CONFLICT DO NOTHING;

-- ============ BAGS ============
INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'bag_type', 'Bag Type', 'select', true, true FROM categories c WHERE c.name = 'Bags'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'brand', 'Brand', 'text', true, false FROM categories c WHERE c.name = 'Bags'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'color', 'Color', 'text', true, false FROM categories c WHERE c.name = 'Bags'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'contents', 'Contents Description', 'text', false, false FROM categories c WHERE c.name = 'Bags'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'distinguishing_marks', 'Distinguishing Marks', 'text', false, false FROM categories c WHERE c.name = 'Bags'
ON CONFLICT DO NOTHING;

-- ============ STUDENT ITEMS ============
INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'item_type', 'Item Type', 'text', true, true FROM categories c WHERE c.name = 'Student Items'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'school_name', 'School / University Name', 'text', true, false FROM categories c WHERE c.name = 'Student Items'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'subject', 'Subject / Course', 'text', true, false FROM categories c WHERE c.name = 'Student Items'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'student_name', 'Student Name on Item', 'text', false, false FROM categories c WHERE c.name = 'Student Items'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'student_id', 'Student ID Number', 'text', false, false FROM categories c WHERE c.name = 'Student Items'
ON CONFLICT DO NOTHING;

-- ============ VEHICLES ============
INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'vehicle_type', 'Vehicle Type', 'select', true, true FROM categories c WHERE c.name = 'Vehicles'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'brand', 'Brand', 'text', true, false FROM categories c WHERE c.name = 'Vehicles'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'color', 'Color', 'text', true, false FROM categories c WHERE c.name = 'Vehicles'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'license_plate', 'License Plate Number', 'text', false, false FROM categories c WHERE c.name = 'Vehicles'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'vin', 'VIN Number', 'text', false, false FROM categories c WHERE c.name = 'Vehicles'
ON CONFLICT DO NOTHING;

-- ============ CLOTHING ============
INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'item_type', 'Item Type', 'text', true, true FROM categories c WHERE c.name = 'Clothing'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'color', 'Color', 'text', true, true FROM categories c WHERE c.name = 'Clothing'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'size', 'Size', 'text', true, false FROM categories c WHERE c.name = 'Clothing'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'brand', 'Brand', 'text', false, false FROM categories c WHERE c.name = 'Clothing'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'distinguishing_marks', 'Distinguishing Marks or Damage', 'text', false, false FROM categories c WHERE c.name = 'Clothing'
ON CONFLICT DO NOTHING;

-- ============ BOOKS ============
INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'title', 'Title', 'text', true, true FROM categories c WHERE c.name = 'Books'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'author', 'Author', 'text', true, false FROM categories c WHERE c.name = 'Books'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'cover_color', 'Cover Color', 'text', true, false FROM categories c WHERE c.name = 'Books'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'name_inside', 'Name Written Inside', 'text', false, false FROM categories c WHERE c.name = 'Books'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'notes', 'Notes or Annotations', 'text', false, false FROM categories c WHERE c.name = 'Books'
ON CONFLICT DO NOTHING;

-- ============ OTHER ============
INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'item_name', 'Item Name', 'text', true, true FROM categories c WHERE c.name = 'Other'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'description', 'Description', 'text', true, true FROM categories c WHERE c.name = 'Other'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'color', 'Color', 'text', true, false FROM categories c WHERE c.name = 'Other'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'serial_number', 'Serial Number', 'text', false, false FROM categories c WHERE c.name = 'Other'
ON CONFLICT DO NOTHING;

INSERT INTO category_fields (category_id, field_key, field_label, field_type, is_public_default, is_required)
SELECT c.id, 'distinguishing_marks', 'Distinguishing Marks', 'text', false, false FROM categories c WHERE c.name = 'Other'
ON CONFLICT DO NOTHING;
