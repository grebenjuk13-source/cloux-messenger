
using System.Diagnostics;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Cloux;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new ClouxWindow());
    }
}

internal sealed class ClouxWindow : Form
{
    private const string ClouxUrl = "https://cloux-messenger.onrender.com/v5/";
    private readonly WebView2 browser = new() { Dock = DockStyle.Fill };

    public ClouxWindow()
    {
        Text = "Cloux Messenger";
        Width = 1180;
        Height = 820;
        MinimumSize = new Size(720, 520);
        BackColor = Color.FromArgb(12, 8, 12);
        Controls.Add(browser);
        Shown += LoadCloux;
    }

    private async void LoadCloux(object? sender, EventArgs e)
    {
        try
        {
            await browser.EnsureCoreWebView2Async();
            browser.CoreWebView2.DocumentTitleChanged += (_, _) =>
            {
                var title = browser.CoreWebView2.DocumentTitle;
                Text = string.IsNullOrWhiteSpace(title) ? "Cloux Messenger" : $"{title} — Cloux";
            };
            browser.CoreWebView2.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
                OpenLink(args.Uri);
            };
            browser.NavigationStarting += (_, args) =>
            {
                if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri) || uri.Host != "cloux-messenger.onrender.com")
                {
                    args.Cancel = true;
                    OpenLink(args.Uri);
                }
            };
            browser.Source = new Uri(ClouxUrl);
        }
        catch (Exception)
        {
            Controls.Clear();
            var message = new Label
            {
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
                ForeColor = Color.White,
                BackColor = BackColor,
                Font = new Font("Segoe UI", 12),
                Padding = new Padding(48),
                Text = "Для запуску Cloux потрібен Microsoft Edge WebView2 Runtime.\n\nВстанови безплатний компонент Microsoft і відкрий Cloux ще раз.\n\nhttps://go.microsoft.com/fwlink/p/?LinkId=2124703"
            };
            Controls.Add(message);
            message.Click += (_, _) => OpenLink("https://go.microsoft.com/fwlink/p/?LinkId=2124703");
        }
    }

    private static void OpenLink(string? value)
    {
        if (Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "https" or "http")
            Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
    }
}
