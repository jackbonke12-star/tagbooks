// Customer-facing "Review Tap" page — the Thank-You Stub.
// SERVER component (thin wrapper): fetches the page row + proof count, emits
// JSON-LD + metadata, then hands the full row to the client component where all
// visuals / animations / toggles live. Next 16: `params` is a promise.

import { notFound } from 'next/navigation';
import { getReviewPage } from '../../../lib/reviewPages';
import { buildJsonLd, buildMetadata } from '../../../lib/reviewSeo';
import ReviewTapClient from './ReviewTapClient';
import './review-public.css';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = await getReviewPage(slug);
  if (!page) return { title: 'Review page' };
  return buildMetadata(page);
}

export default async function ReviewTapPage({ params }) {
  const { slug } = await params;
  const page = await getReviewPage(slug);
  if (!page) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(page)) }}
      />
      <ReviewTapClient page={page} />
    </>
  );
}
