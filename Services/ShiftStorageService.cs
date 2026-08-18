using System.Text.Json;
using HoursCompletionNotifier.Models;

namespace HoursCompletionNotifier.Services;

public class ShiftStorageService
{
    private readonly string _filePath;

    public ShiftStorageService(string filePath = "shifts.json")
    {
        _filePath = filePath;
    }

    public List<ShiftRecord> LoadAll()
    {
        if (!File.Exists(_filePath))
            return new List<ShiftRecord>();

        var json = File.ReadAllText(_filePath);
        return JsonSerializer.Deserialize<List<ShiftRecord>>(json) ?? new List<ShiftRecord>();
    }

    public void Save(ShiftRecord shift)
    {
        var all = LoadAll();
        all.RemoveAll(s => s.Date == shift.Date);
        all.Add(shift);

        var json = JsonSerializer.Serialize(all, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(_filePath, json);
    }

    public ShiftRecord? GetByDate(string date) => LoadAll().FirstOrDefault(s => s.Date == date);
}
