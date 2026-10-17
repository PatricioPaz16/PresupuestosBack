import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { CondicionIva } from '../../../common/constants/dominio.constant';

/**
 * Taller (tenant). La tabla la crea la migración SQL; esta entidad la usa la parte de
 * autenticación (relación con User). La configuración se lee y escribe con SQL en
 * TalleresService, dentro del contexto del taller.
 */
@Entity('talleres')
export class Taller {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nombre: string;

  @Column({ name: 'razon_social', type: 'text', nullable: true })
  razonSocial: string | null;

  @Column({ type: 'text', nullable: true })
  cuit: string | null;

  @Column({
    name: 'condicion_iva',
    type: 'enum',
    enum: ['monotributo', 'responsable_inscripto', 'exento'],
    enumName: 'condicion_iva',
  })
  condicionIva: CondicionIva;

  @Column({ name: 'zona_horaria' })
  zonaHoraria: string;

  /** El logo puede pesar cientos de KB: no se trae salvo que se pida explícitamente. */
  @Column({
    name: 'logo_data_url',
    type: 'text',
    nullable: true,
    select: false,
  })
  logoDataUrl: string | null;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
