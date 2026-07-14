import QRCode from 'qrcode';
import { campaignIsPublic } from './_shared/campaign-rules.mjs';
import { findCampaignBySlug } from './_shared/campaign-service.mjs';

export default async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug') || '';
    const campaign = await findCampaignBySlug(slug);
    if (!campaign || !campaignIsPublic(campaign)) return new Response('Campaign not found', { status: 404 });
    const origin = (process.env.URL || process.env.SITE_URL || url.origin).replace(/\/$/, '');
    const landingUrl = `${origin}/campaign/${encodeURIComponent(campaign.slug)}`;
    const svg = await QRCode.toString(landingUrl, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 640,
      color: { dark: '#09111f', light: '#ffffff' }
    });
    const download = url.searchParams.get('download') === '1';
    return new Response(svg, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=300, must-revalidate',
        ...(download ? { 'content-disposition': `attachment; filename="izhe-${campaign.slug}-qr.svg"` } : {})
      }
    });
  } catch (error) {
    console.error('campaign-qr', error);
    return new Response('QR code could not be generated', { status: 500 });
  }
};
