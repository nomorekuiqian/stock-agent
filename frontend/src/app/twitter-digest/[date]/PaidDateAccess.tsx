'use client';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import PaidDate from './PaidDate';
export function PaidDateAccess(){const {has}=useEntitlements();return has('twitter_digest')?<PaidDate/>:null;}
