import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CatalogoController } from './catalogo.controller';
import { CatalogoService } from './catalogo.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [UsersModule],
  controllers: [StockController, CatalogoController],
  providers: [CatalogoService, StockService],
})
export class CatalogoModule {}
