import type { RouteObject } from "react-router-dom";
import { DashboardPage } from "../pages/dashboard/DashboardPage";

export const protectedRoutes: RouteObject[] = [{ index: true, element: <DashboardPage /> }];
