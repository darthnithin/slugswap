import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';
import { fetchFoodVendorFeed } from '@/lib/server/food-vendors/source';
import { foodVendorDate } from '../../../../../shared/food-vendors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const getFeed = unstable_cache(fetchFoodVendorFeed, ['ucsc-food-vendors-v1'], {
  revalidate: 300,
});

export async function GET() {
  try {
    // Include the Pacific date in the cache key; yesterday's check-ins must never
    // reappear as today's if UCSC is down or a refresh crosses midnight.
    return NextResponse.json(await getFeed(foodVendorDate()), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('UCSC food vendors unavailable', error);
    return NextResponse.json(
      { error: 'Food vendors could not be refreshed. Please try again.' },
      { status: 503 },
    );
  }
}
