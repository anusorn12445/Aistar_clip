import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesController, TeamsController, UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, RolesController, TeamsController],
  providers: [UsersService],
})
export class UsersModule {}
