// Deprecated - xem bao-cao/route.js
import { NextResponse } from 'next/server';
export async function GET() { return NextResponse.json({ message: 'Dùng /api/nhien-lieu/bao-cao' }, { status: 410 }); }
