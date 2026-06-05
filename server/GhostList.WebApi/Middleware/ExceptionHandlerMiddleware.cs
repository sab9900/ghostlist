using FluentValidation;
using GhostList.Application.Common.Exceptions;
using System.Net;
using System.Text.Json;

namespace GhostList.WebApi.Middleware;

public class ExceptionHandlerMiddleware(RequestDelegate next, ILogger<ExceptionHandlerMiddleware> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        object body;
        HttpStatusCode statusCode;

        switch (exception)
        {
            case ValidationException ve:
                statusCode = HttpStatusCode.BadRequest;
                var errors = ve.Errors
                    .GroupBy(e => e.PropertyName)
                    .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray());
                body = new { errors };
                break;

            case NotFoundException e:
                statusCode = HttpStatusCode.NotFound;
                body = new { error = e.Message };
                break;

            case ArgumentException:
            case InvalidOperationException:
                statusCode = HttpStatusCode.BadRequest;
                body = new { error = exception.Message };
                break;

            default:
                logger.LogError(exception, "Unhandled exception.");
                statusCode = HttpStatusCode.InternalServerError;
                body = new { error = "An unexpected error occurred." };
                break;
        }

        context.Response.StatusCode = (int)statusCode;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync(JsonSerializer.Serialize(body, JsonOptions));
    }
}
