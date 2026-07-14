// Deprecated - xem upload/route.js
import { NextResponse } from 'next/server';
export async function POST() { return NextResponse.json({ message: 'Dùng /api/nhien-lieu/upload' }, { status: 410 }); }
