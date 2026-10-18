'use client';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import PaidDigest from './PaidDigest';
export function PaidDigestAccess(){const {has}=useEntitlements();return has('twitter_digest')?<PaidDigest/>:null;}
