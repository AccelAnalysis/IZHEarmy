import { saveInquiry } from './_shared/campaign-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  try {
    const payload = await request.json();
    if (String(payload?.botField || payload?.['bot-field'] || '').trim()) return json({ success: true }, 200);
    const inquiry = await saveInquiry({
      organization: payload.organization,
      contactName: payload.name || payload.contactName,
      email: payload.email,
      phone: payload.phone,
      attendance: payload.attendance,
      timeframe: payload.timeframe,
      ministryObjective: payload.cause || payload.ministryObjective,
      eventType: payload.eventType || 'church',
      preferredDate: payload.preferredDate,
      source: 'website',
      status: 'new'
    });
    return json({ success: true, inquiryId: inquiry.id }, 201);
  } catch (error) {
    console.error('church-inquiry', error);
    return json({ error: error.message || 'Your request could not be submitted.' }, 400);
  }
};
