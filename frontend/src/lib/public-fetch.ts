import { cache } from 'react';
export const publicFetch=cache(async <T,>(path:string):Promise<T|null>=>{
 const response=await fetch(`${process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000/api'}${path}`,{next:{revalidate:300},signal:AbortSignal.timeout(15000)});
 if(response.status===404)return null;
 if(!response.ok)throw new Error(`Public source ${path}: ${response.status}`);
 return response.json();
});
