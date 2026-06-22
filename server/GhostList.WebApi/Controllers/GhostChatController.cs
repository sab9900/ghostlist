using GhostList.Application.Features.GhostMessages.Commands.CreateGhostChatMessage;
using GhostList.Application.Features.GhostMessages.Commands.DeleteGhostChatMessage;
using GhostList.Application.Features.GhostMessages.Commands.SaveGhostMessageAudio;
using GhostList.Application.Features.GhostMessages.Commands.SaveGhostMessageImage;
using GhostList.Application.Features.GhostMessages.Commands.SaveGhostMessageVideo;
using GhostList.Application.Features.GhostMessages.Queries.GetGhostChatMessagesByListId;
using GhostList.Application.Features.GhostMessages.Queries.GetGhostMessageAudio;
using GhostList.Application.Features.GhostMessages.Queries.GetGhostMessageImage;
using GhostList.Application.Features.GhostMessages.Queries.GetGhostMessageVideo;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GhostList.WebApi.Controllers;

public record SaveGhostMessageImageRequest(string EncryptedImage, string ImageInitializationVector);
public record SaveGhostMessageAudioRequest(string EncryptedAudio, string AudioInitializationVector);
public record SaveGhostMessageVideoRequest(string EncryptedVideo, string VideoInitializationVector);

[ApiController]
[Route("api/[controller]")]
public class ChatController(IMediator mediator) : ControllerBase
{
    [HttpGet("{listId:guid}")]
    public async Task<ActionResult<GhostChatMessagePageDto>> GetByListId(Guid listId, [FromQuery] DateTime? before, [FromQuery] int take = ChatMessagePaging.DefaultPageSize)
    {
        var page = await mediator.Send(new GetGhostChatMessagesByListIdQuery(listId, before, take));
        return Ok(page);
    }

    [HttpPost]
    [EnableRateLimiting("write-content")]
    public async Task<ActionResult<Guid>> Create([FromBody] CreateGhostMessageCommand command)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        var userId = Request.Headers["X-User-Id"].FirstOrDefault();
        var messageId = await mediator.Send(command with { SenderDeviceId = deviceId, SenderUserId = userId });
        return Ok(messageId);
    }

    [HttpDelete("{id:guid}")]
    [EnableRateLimiting("write-content")]
    public async Task<ActionResult> DeleteMessage(Guid id)
    {
        await mediator.Send(new DeleteGhostChatMessageCommand(id));
        return NoContent();
    }

    [HttpPost("{messageId:guid}/image")]
    [EnableRateLimiting("media-upload")]
    public async Task<ActionResult> SaveImage(Guid messageId, [FromBody] SaveGhostMessageImageRequest request)
    {
        await mediator.Send(new SaveGhostMessageImageCommand(messageId, request.EncryptedImage, request.ImageInitializationVector));
        return NoContent();
    }

    [HttpGet("{messageId:guid}/image")]
    public async Task<ActionResult<GhostMessageImageDto>> GetImage(Guid messageId)
    {
        var image = await mediator.Send(new GetGhostMessageImageQuery(messageId));
        return Ok(image);
    }

    [HttpPost("{messageId:guid}/audio")]
    [EnableRateLimiting("media-upload")]
    public async Task<ActionResult> SaveAudio(Guid messageId, [FromBody] SaveGhostMessageAudioRequest request)
    {
        await mediator.Send(new SaveGhostMessageAudioCommand(messageId, request.EncryptedAudio, request.AudioInitializationVector));
        return NoContent();
    }

    [HttpGet("{messageId:guid}/audio")]
    public async Task<ActionResult<GhostMessageAudioDto>> GetAudio(Guid messageId)
    {
        var audio = await mediator.Send(new GetGhostMessageAudioQuery(messageId));
        return Ok(audio);
    }

    [HttpPost("{messageId:guid}/video")]
    [EnableRateLimiting("media-upload")]
    public async Task<ActionResult> SaveVideo(Guid messageId, [FromBody] SaveGhostMessageVideoRequest request)
    {
        await mediator.Send(new SaveGhostMessageVideoCommand(messageId, request.EncryptedVideo, request.VideoInitializationVector));
        return NoContent();
    }

    [HttpGet("{messageId:guid}/video")]
    public async Task<ActionResult<GhostMessageVideoDto>> GetVideo(Guid messageId)
    {
        var video = await mediator.Send(new GetGhostMessageVideoQuery(messageId));
        return Ok(video);
    }
}
