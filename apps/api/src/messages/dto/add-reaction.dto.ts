import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class AddReactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  emoji: string;
}
