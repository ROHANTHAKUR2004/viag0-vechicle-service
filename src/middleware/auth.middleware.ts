import { NextFunction, Response, Request } from "express";
import jwt, { JwtPayload as DefaultJwtPayload, JwtPayload } from "jsonwebtoken";
import ApiError from "../utlis/ApiError"


export interface JWT_PAYLOAD extends JwtPayload {
  id: string;
}


export const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];

    console.log("usr token", token)

    if (!token) {
      return next(new ApiError( "Unauthorized – No token provided", 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string ) as JWT_PAYLOAD;
    console.log("decoded ", decoded);
    if(!decoded){
      return next(new ApiError( "Please Login to Continue your token has been expired ", 401))
    }

   
    req.user = decoded;

    next();
  } catch (error) {
    console.error("JWT Error:", error);
    return next(new ApiError( "Unauthorized – Invalid or expired token", 401));
  }
};
