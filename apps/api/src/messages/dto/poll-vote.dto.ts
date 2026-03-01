import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class PollVoteDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID('4')
  optionId: string;
}
