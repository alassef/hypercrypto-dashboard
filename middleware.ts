import { NextResponse } from 'next/server';

export function middleware(req) {
    const auth = req.headers.get('authorization');

    if (!auth) {
        return new Response('Authentication required', { status: 401 });
    }

    const [scheme, encoded] = auth.split(' ');
    if (scheme !== 'Basic' || !encoded) {
        return new Response('Authentication required', { status: 401 });
    }

    const buffer = Buffer.from(encoded, 'base64');
    const [user, pass] = buffer.toString().split(':');

    const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER;
    const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS;

    if (user !== BASIC_AUTH_USER || pass !== BASIC_AUTH_PASS) {
        return new Response('Invalid credentials', { status: 403 });
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/dashboard/:path*'], // Apply middleware to all dashboard routes
};