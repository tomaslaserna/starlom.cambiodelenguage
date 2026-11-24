import {requireStaffSession} from '@/lib/auth';
import {ADMIN_METRICS_READ_PERMISSION,ADMIN_SALARIES_READ_PERMISSION} from '@/lib/route-auth';
import {requirePagePermission} from '@/lib/page-auth';
import {ErpMonthlyCostsWorkspace} from './workspace';
export const dynamic='force-dynamic';
export default async function Page(){const session=await requireStaffSession();await requirePagePermission(session,[ADMIN_METRICS_READ_PERMISSION]);await requirePagePermission(session,[ADMIN_SALARIES_READ_PERMISSION]);return <ErpMonthlyCostsWorkspace endpoint="/api/administration/monthly-costs"/>;}
