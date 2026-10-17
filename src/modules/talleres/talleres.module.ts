import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Taller } from './entities/taller.entity';
import { TalleresController } from './talleres.controller';
import { TalleresService } from './talleres.service';

@Module({
  imports: [TypeOrmModule.forFeature([Taller])],
  controllers: [TalleresController],
  providers: [TalleresService],
  exports: [TalleresService],
})
export class TalleresModule {}
