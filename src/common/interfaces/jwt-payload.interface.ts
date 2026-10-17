export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  /** Id del refresh token (sesión) que emitió este JWT. */
  sid: string;
}
