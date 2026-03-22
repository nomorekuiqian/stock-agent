import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const CRON_SECRET = process.env.CRON_SECRET || '';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const page = searchParams.get('page') || '1';
  const pageSize = searchParams.get('page_size') || '20';

  const headers = {
    'X-Cron-Secret': CRON_SECRET,
    'Content-Type': 'application/json',
  };

  const statsParams = new URLSearchParams();
  if (startDate) statsParams.set('start_date', startDate);
  if (endDate) statsParams.set('end_date', endDate);

  const emailListParams = new URLSearchParams();
  if (startDate) emailListParams.set('start_date', startDate);
  if (endDate) emailListParams.set('end_date', endDate);

  const [statsRes, userRes, emailListRes] = await Promise.all([
    fetch(`${API_BASE_URL}/feedback/stats?${statsParams.toString()}`, { headers }),
    fetch(`${API_BASE_URL}/feedback/user/list?page=${page}&page_size=${pageSize}`, { headers }),
    fetch(`${API_BASE_URL}/feedback/email/list?${emailListParams.toString()}`, { headers }),
  ]);

  if (!statsRes.ok || !userRes.ok) {
    return NextResponse.json(
      { error: `Backend error: stats=${statsRes.status} user=${userRes.status} emailList=${emailListRes.status}` },
      { status: 500 }
    );
  }

  const emailListText = await emailListRes.text();
  let emailList: unknown = { data: [], total_records: 0, _error: null as string | null };
  if (emailListRes.ok) {
    try {
      emailList = JSON.parse(emailListText);
    } catch {
      (emailList as { _error: string | null })._error = `JSON parse failed: ${emailListText.slice(0, 200)}`;
    }
  } else {
    (emailList as { _error: string | null })._error = `HTTP ${emailListRes.status}: ${emailListText.slice(0, 200)}`;
  }

  const [stats, userFeedback] = await Promise.all([statsRes.json(), userRes.json()]);

  return NextResponse.json({ stats, userFeedback, emailList });
}
