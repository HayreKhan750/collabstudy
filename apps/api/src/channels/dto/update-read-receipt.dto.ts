import { IsUUID } from 'class-validator';

export class UpdateReadReceiptDto {
  @IsUUID('4')
  messageId: string;
}
