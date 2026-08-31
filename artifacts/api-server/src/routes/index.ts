import { Router, type IRouter } from "express";
import healthRouter from "./health";
import nexusRouter from "./nexus";

const router: IRouter = Router();

router.use(healthRouter);
router.use(nexusRouter);

export default router;
