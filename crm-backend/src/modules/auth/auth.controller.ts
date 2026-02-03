import { Body, Controller, Get, Post, UseGuards, Request } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { AuthGuard } from "@nestjs/passport";

@ApiTags("auth")
@Controller()
export class AuthController {
  constructor(private auth: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 req/min
  @Post("auth/login")
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard("jwt"))
  @Get("me")
  async me(@Request() req: any) {
    return this.auth.me(req.user);
  }
}
