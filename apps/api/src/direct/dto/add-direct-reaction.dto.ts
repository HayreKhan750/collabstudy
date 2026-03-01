import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class AddDirectReactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  emoji: string;
}
