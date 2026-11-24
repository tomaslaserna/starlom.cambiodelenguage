import {notFound} from 'next/navigation';
import {CostObligationsWorkspace} from '@/app/administration/obligations/workspace';
export default function Page(){if(process.env.NODE_ENV!=='development')notFound();return <CostObligationsWorkspace endpoint="/api/preview/cost-obligations" local/>;}
