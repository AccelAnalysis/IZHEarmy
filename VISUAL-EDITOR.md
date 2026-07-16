# IZHE Visual Website Editor

The visual editor is available at `/visual-editor.html` after signing into `/admin.html` with the configured administrator token.

## Editing model

The editor displays the real customer-facing homepage in a protected frame. Gold-outlined text can be edited inline. Images, buttons, backgrounds, and section settings open controlled editing tools in the right panel.

The visual editor supports:

- Homepage text and button labels
- Button destinations
- Homepage images and background images
- Media Library selection and image upload
- Section visibility
- Section movement within the governed homepage structure
- Safe alignment, spacing, overlay, focal-point, and image-position presets
- Desktop, tablet, and mobile preview widths
- Undo and reset of unsaved changes
- Protected visual drafts
- Explicit publishing to the customer-facing site

## Safety boundaries

The editor does not provide unrestricted pixel positioning. Navigation, commerce, checkout, product cards, redemption forms, and structural columns remain governed components. The Product Catalog, Campaigns, Books & Teaching, and Operations workspaces remain the authoritative editors for their respective data.

A visual draft is stored separately from published website content. Saving a draft does not change the public site. Publishing performs a revision check and writes all changed content records atomically, preserving the existing content-version history.
