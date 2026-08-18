using System.Net;
using System.Net.Mail;
using System.Text.Json;
using HoursLoggedNotifier.Models;

namespace HoursLoggedNotifier.Services;

public class EmailService
{
    private const string PlaceholderPassword = "PUT_YOUR_OUTLOOK_APP_PASSWORD_HERE";
    private readonly AppConfig? _config;

    public EmailService(string configPath = "appsettings.json")
    {
        if (File.Exists(configPath))
        {
            var json = File.ReadAllText(configPath);
            _config = JsonSerializer.Deserialize<AppConfig>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_config?.Email.Address)
        && !string.IsNullOrWhiteSpace(_config?.Email.AppPassword)
        && _config.Email.AppPassword != PlaceholderPassword;

    public int ReminderIntervalMinutes => _config?.ReminderIntervalMinutes ?? 60;

    public int RequiredOfficeDaysPerWeek => _config?.RequiredOfficeDaysPerWeek ?? 3;

    public void Send(string subject, string body)
    {
        if (!IsConfigured || _config is null)
            throw new InvalidOperationException("Email is not configured. Fill in appsettings.json with your Outlook app password.");

        using var client = new SmtpClient(_config.Email.SmtpServer, _config.Email.SmtpPort)
        {
            EnableSsl = true,
            Credentials = new NetworkCredential(_config.Email.Address, _config.Email.AppPassword)
        };

        using var message = new MailMessage
        {
            From = new MailAddress(_config.Email.Address, _config.Email.DisplayName),
            Subject = subject,
            Body = body
        };
        message.To.Add(_config.Email.Address);

        client.Send(message);
    }
}
