import type {Response} from "express";

export const errorHandler = (err: any, res: Response, ) => {
    console.error(err.stack);
    res.status(500).json({ error: "Internal Server Error", message: err.message });
};
